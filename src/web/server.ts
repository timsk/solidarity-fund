import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../domain/applicant/repository.ts";
import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import type { Volunteer } from "../domain/volunteer/types.ts";
import { SQLiteApplicationRepository } from "../infrastructure/application/sqliteApplicationRepository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import { SQLiteGrantRepository } from "../infrastructure/grant/sqliteGrantRepository.ts";
import { DocumentStore } from "../infrastructure/projections/documents.ts";
import {
	type SessionStore,
	startCleanupTimer,
} from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { changePasswordPage } from "./pages/changePassword.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { createAltchaRoutes } from "./routes/altcha.ts";
import { createApplicantRoutes } from "./routes/applicants-admin.ts";
import { createApplicationRoutes } from "./routes/applications.ts";
import { createApplyRoutes } from "./routes/apply.ts";
import {
	handleChangePassword,
	handleLogin,
	handleLogout,
} from "./routes/auth.ts";
import { dbDownloadResponse } from "./routes/download-db.ts";
import { createGrantRoutes } from "./routes/grants.ts";
import { createLogsRoutes } from "./routes/logs.ts";
import { createLotteryRoutes } from "./routes/lottery.ts";
import { createOutboxRoutes } from "./routes/outbox.ts";
import { createStatusRoutes } from "./routes/status.ts";
import { autoCloseExpiredLottery, currentMonthCycle } from "./routes/utils.ts";
import { createVolunteerRoutes } from "./routes/volunteers.ts";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(req: Request): Response | null {
	const forwarded = req.headers.get("x-forwarded-for");
	const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
	const now = Date.now();
	const windowMs = 15 * 60 * 1000;
	const limit = 10;

	// Clean up expired entries
	for (const [key, entry] of loginAttempts) {
		if (now >= entry.resetAt) loginAttempts.delete(key);
	}

	const entry = loginAttempts.get(ip);
	if (entry && now < entry.resetAt) {
		if (entry.count >= limit) {
			return new Response("Too Many Requests", { status: 429 });
		}
		entry.count++;
	} else {
		loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
	}
	return null;
}

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "SAMEORIGIN",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net; worker-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

function withSecurityHeaders(res: Response): Response {
	const headers = new Headers(res.headers);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(key, value);
	}
	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers,
	});
}

type RouteHandler = (req: Request) => Response | Promise<Response>;
type RouteMethods = Record<string, RouteHandler>;

function secureRoutes(
	routes: Record<string, RouteMethods>,
): Record<string, RouteMethods> {
	return Object.fromEntries(
		Object.entries(routes).map(([path, methods]) => [
			path,
			Object.fromEntries(
				Object.entries(methods).map(([method, handler]) => [
					method,
					async (req: Request) => withSecurityHeaders(await handler(req)),
				]),
			),
		]),
	);
}

// fallow-ignore-next-line unused-exports
export async function getAuthenticatedVolunteer(
	req: Request,
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
) {
	const sid = getSessionId(req);
	if (!sid) return null;
	const volunteerId = await sessionStore.get(sid);
	if (!volunteerId) return null;
	return volunteerRepo.getById(volunteerId);
}

// fallow-ignore-next-line unused-exports
export function requirePasswordChange(volunteer: Volunteer): Response | null {
	if (volunteer.requiresPasswordReset)
		return Response.redirect("/change-password", 302);
	return null;
}

export async function startServer(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
	applicantRepo: ApplicantRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	dbPath: string,
	port = 3000,
	tlsCert?: string,
	tlsKey?: string,
) {
	startCleanupTimer(sessionStore);
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();
	const hmacKey = process.env.ALTCHA_HMAC_KEY;
	if (!hmacKey) {
		throw new Error("ALTCHA_HMAC_KEY environment variable is required");
	}
	const docStore = DocumentStore(pool);
	await docStore.init();
	const credentialsStore = await SQLiteVolunteerCredentialsStore(pool);
	const appRepo = SQLiteApplicationRepository(pool);
	const applyRoutes = createApplyRoutes(
		eventStore,
		pool,
		applicantRepo,
		hmacKey,
		docStore,
		appRepo,
	);
	const applicantRoutes = createApplicantRoutes(
		applicantRepo,
		volunteerRepo,
		eventStore,
	);
	const volunteerRoutes = createVolunteerRoutes(
		volunteerRepo,
		eventStore,
		credentialsStore,
	);
	const logsRoutes = createLogsRoutes(pool);
	const outboxRoutes = createOutboxRoutes(pool);
	const applicationRoutes = createApplicationRoutes(
		appRepo,
		applicantRepo,
		volunteerRepo,
		eventStore,
		pool,
	);
	const lotteryRoutes = createLotteryRoutes(appRepo, eventStore, pool);
	const grantRepo = SQLiteGrantRepository(pool);
	const statusRoutes = createStatusRoutes(appRepo, grantRepo);
	const grantRoutes = createGrantRoutes(
		grantRepo,
		volunteerRepo,
		docStore,
		eventStore,
		pool,
	);
	const altchaRoutes = createAltchaRoutes(hmacKey);
	const changePasswordHandler = handleChangePassword(
		volunteerRepo,
		eventStore,
		sessionStore,
		credentialsStore,
	);

	async function requireAuth(req: Request) {
		return getAuthenticatedVolunteer(req, sessionStore, volunteerRepo);
	}

	const server = Bun.serve({
		port,
		...(tlsCert && tlsKey
			? { tls: { cert: Bun.file(tlsCert), key: Bun.file(tlsKey) } }
			: {}),
		routes: secureRoutes({
			"/apply": {
				GET: () => applyRoutes.showForm(),
				POST: (req) => {
					const limited = checkLoginRateLimit(req);
					if (limited) return limited;
					return applyRoutes.handleSubmit(req);
				},
			},
			"/apply/result": {
				GET: (req) => applyRoutes.showResult(req),
			},
			"/status": {
				GET: (req) => statusRoutes.show(req),
			},
			"/api/altcha/challenge": {
				GET: () => altchaRoutes.challenge(),
			},
			"/scripts/altcha.js": {
				GET: async () => {
					const file = Bun.file("node_modules/altcha/dist/main/altcha.js");
					return new Response(file, {
						headers: { "Content-Type": "application/javascript" },
					});
				},
			},
			"/styles/app.css": {
				GET: async () => {
					const file = Bun.file("src/web/styles/dist/app.css");
					return new Response(file, {
						headers: { "Content-Type": "text/css" },
					});
				},
			},
			"/solidarity.png": {
				GET: async () => {
					const file = Bun.file("src/web/static/solidarity.png");
					return new Response(file, {
						headers: { "Content-Type": "image/png" },
					});
				},
			},
			"/favicon.ico": {
				GET: async () => {
					const file = Bun.file("src/web/static/favicon.ico");
					return new Response(file, {
						headers: { "Content-Type": "image/x-icon" },
					});
				},
			},
			"/": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return new Response(dashboardPage(volunteer), {
						headers: { "Content-Type": "text/html" },
					});
				},
			},
			"/login": {
				GET: () =>
					new Response(loginHtml, {
						headers: { "Content-Type": "text/html" },
					}),
				POST: (req) => {
					const limited = checkLoginRateLimit(req);
					if (limited) return limited;
					return login(req);
				},
			},
			"/logout": {
				POST: (req) => logout(req),
			},
			"/change-password": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return new Response(changePasswordPage(), {
						headers: { "Content-Type": "text/html" },
					});
				},
				POST: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return changePasswordHandler(req, volunteer.id);
				},
			},
			"/logs": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return logsRoutes.list(req);
				},
			},
			"/outbox": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return outboxRoutes.list(req);
				},
			},
			"/outbox/delete": {
				POST: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return outboxRoutes.deleteMessages(req);
				},
			},
			"/download-db": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return dbDownloadResponse(dbPath);
				},
			},
			"/volunteers": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.list();
				},
			},
			"/volunteers/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.create();
				},
			},
			"/volunteers/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.closePanel();
				},
			},
			"/grants": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					const url = new URL(req.url);
					return grantRoutes.list(url.searchParams.get("month") ?? undefined);
				},
			},
			"/grants/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return grantRoutes.closePanel();
				},
			},
			"/applications": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					const url = new URL(req.url);
					const status = url.searchParams.get("status") ?? undefined;
					const payment = url.searchParams.get("payment") ?? undefined;
					return applicationRoutes.list(
						url.searchParams.get("month") ?? undefined,
						{
							status: status && status !== "all" ? status : undefined,
							paymentPreference:
								payment && payment !== "all" ? payment : undefined,
						},
					);
				},
			},
			"/applications/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return applicationRoutes.closePanel();
				},
			},
			"/lottery": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return lotteryRoutes.show();
				},
			},
			"/applicants": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return applicantRoutes.list();
				},
			},
			"/applicants/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return applicantRoutes.create();
				},
			},
			"/applicants/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const redirect = requirePasswordChange(volunteer);
					if (redirect) return redirect;
					return applicantRoutes.closePanel();
				},
			},
		}),
		async fetch(req) {
			const url = new URL(req.url);
			const volunteer = await requireAuth(req);
			if (!volunteer)
				return withSecurityHeaders(Response.redirect("/login", 302));

			const pwRedirect = requirePasswordChange(volunteer);
			if (pwRedirect) return withSecurityHeaders(pwRedirect);

			if (url.pathname === "/volunteers" && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleCreate(req, volunteer.id);
			}

			const volEditMatch = url.pathname.match(/^\/volunteers\/([^/]+)\/edit$/);
			if (volEditMatch?.[1] && req.method === "GET") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.edit(volEditMatch[1], volunteer.id);
			}

			const volDisableMatch = url.pathname.match(
				/^\/volunteers\/([^/]+)\/disable$/,
			);
			if (volDisableMatch?.[1] && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleDisable(volDisableMatch[1], volunteer.id);
			}

			const volEnableMatch = url.pathname.match(
				/^\/volunteers\/([^/]+)\/enable$/,
			);
			if (volEnableMatch?.[1] && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleEnable(volEnableMatch[1], volunteer.id);
			}

			const volIdMatch = url.pathname.match(/^\/volunteers\/([^/]+)$/);
			if (volIdMatch?.[1]) {
				const id = volIdMatch[1];
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				if (req.method === "PUT")
					return volunteerRoutes.handleUpdate(id, req, volunteer.id);
			}

			// Application document serving
			const appDocMatch = url.pathname.match(
				/^\/applications\/([^/]+)\/documents\/poa$/,
			);
			if (appDocMatch?.[1] && req.method === "GET") {
				const docs = await docStore.getByEntityId(appDocMatch[1]);
				const poa = docs.find((d) => d.type === "proof_of_address");
				if (!poa) return new Response("Not found", { status: 404 });
				return grantRoutes.serveDocument(poa.id);
			}

			// Grant document serving — look up poa_ref from the grant row
			const grantDocMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/documents\/poa$/,
			);
			if (grantDocMatch?.[1] && req.method === "GET") {
				const grant = await grantRepo.getById(grantDocMatch[1]);
				if (!grant?.proofOfAddressRef)
					return new Response("Not found", { status: 404 });
				return grantRoutes.serveDocument(grant.proofOfAddressRef);
			}

			// Grant actions (must come before grant detail match)
			const grantAssignMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/assign-volunteer$/,
			);
			if (grantAssignMatch?.[1] && req.method === "POST") {
				const volunteerId = new URL(req.url).searchParams.get("volunteerId");
				if (!volunteerId)
					return new Response("Missing volunteerId", { status: 400 });
				return grantRoutes.handleAssignVolunteer(
					grantAssignMatch[1],
					volunteerId,
				);
			}

			const grantBankMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/update-bank-details$/,
			);
			if (grantBankMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleUpdateBankDetails(grantBankMatch[1], req);
			}

			const grantApprovePoaMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/approve-poa$/,
			);
			if (grantApprovePoaMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleApprovePoa(
					grantApprovePoaMatch[1],
					volunteer.id,
				);
			}

			const grantRejectPoaMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/reject-poa$/,
			);
			if (grantRejectPoaMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleRejectPoa(
					grantRejectPoaMatch[1],
					volunteer.id,
				);
			}

			const grantAcceptCashMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/accept-cash$/,
			);
			if (grantAcceptCashMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleAcceptCash(grantAcceptCashMatch[1]);
			}

			const grantDeclineCashMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/decline-cash$/,
			);
			if (grantDeclineCashMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleDeclineCash(grantDeclineCashMatch[1]);
			}

			const grantPaymentMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/record-payment$/,
			);
			if (grantPaymentMatch?.[1] && req.method === "POST") {
				const params = new URL(req.url).searchParams;
				const rawAmount = params.get("amount");
				const method = params.get("method");
				const amount = Number(rawAmount);
				if (!rawAmount || Number.isNaN(amount) || amount <= 0) {
					return new Response("Invalid amount", { status: 400 });
				}
				if (method !== "bank" && method !== "cash") {
					return new Response("Invalid payment method", { status: 400 });
				}
				return grantRoutes.handleRecordPayment(
					grantPaymentMatch[1],
					amount,
					method,
					volunteer.id,
				);
			}

			const grantReimburseMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/record-reimbursement$/,
			);
			if (grantReimburseMatch?.[1] && req.method === "POST") {
				const expenseReference =
					new URL(req.url).searchParams.get("expenseReference") ?? "";
				return grantRoutes.handleRecordReimbursement(
					grantReimburseMatch[1],
					expenseReference,
					volunteer.id,
				);
			}

			const grantReleaseMatch = url.pathname.match(
				/^\/grants\/([^/]+)\/release$/,
			);
			if (grantReleaseMatch?.[1] && req.method === "POST") {
				const reason =
					new URL(req.url).searchParams.get("reason") ?? "Released";
				return grantRoutes.handleRelease(
					grantReleaseMatch[1],
					reason,
					volunteer.id,
				);
			}

			const grantNotesMatch = url.pathname.match(/^\/grants\/([^/]+)\/notes$/);
			if (grantNotesMatch?.[1] && req.method === "POST") {
				return grantRoutes.handleUpdateNotes(grantNotesMatch[1], req);
			}

			// Grant detail
			const grantIdMatch = url.pathname.match(/^\/grants\/([^/]+)$/);
			if (grantIdMatch?.[1] && req.method === "GET") {
				return grantRoutes.detail(grantIdMatch[1]);
			}

			// Application review (must come before detail match)
			const appReviewMatch = url.pathname.match(
				/^\/applications\/([^/]+)\/review$/,
			);
			if (appReviewMatch?.[1] && req.method === "POST") {
				const decision = new URL(req.url).searchParams.get("decision");
				if (decision === "confirm" || decision === "reject") {
					return applicationRoutes.handleReview(
						appReviewMatch[1],
						decision,
						volunteer.id,
					);
				}
				return new Response("Invalid decision", { status: 400 });
			}

			// Application revert review (must come before detail match)
			const appRevertReviewMatch = url.pathname.match(
				/^\/applications\/([^/]+)\/revert-review$/,
			);
			if (appRevertReviewMatch?.[1] && req.method === "POST") {
				return applicationRoutes.handleRevertReview(
					appRevertReviewMatch[1],
					volunteer.id,
				);
			}

			// Application detail
			const appIdMatch = url.pathname.match(/^\/applications\/([^/]+)$/);
			if (appIdMatch?.[1] && req.method === "GET") {
				return applicationRoutes.detail(appIdMatch[1]);
			}

			// Application history (lazy-loaded by history tab)
			const appHistoryMatch = url.pathname.match(
				/^\/applications\/([^/]+)\/history$/,
			);
			if (appHistoryMatch?.[1] && req.method === "GET") {
				return applicationRoutes.history(appHistoryMatch[1]);
			}

			if (url.pathname === "/lottery/open" && req.method === "POST") {
				const signals = await req.json();
				const expectedClosing = String(signals.expectedclosing ?? "");
				if (!expectedClosing) {
					return new Response("Expected closing date is required", {
						status: 400,
					});
				}
				const lotteryName =
					String(signals.lotteryname ?? "").trim() || currentMonthCycle();
				return lotteryRoutes.handleOpen(lotteryName, expectedClosing);
			}
			if (url.pathname === "/lottery/close" && req.method === "POST") {
				return lotteryRoutes.handleClose();
			}
			if (url.pathname === "/lottery/cancel" && req.method === "POST") {
				return lotteryRoutes.handleCancel();
			}
			if (url.pathname === "/lottery/draw" && req.method === "POST") {
				const signals = await req.json();
				const balance = Number(signals.availablebalance);
				const reserve = Number(signals.reserve);
				const grant = Number(signals.grantamount);
				if ([balance, reserve, grant].some(Number.isNaN)) {
					return new Response("Invalid input", { status: 400 });
				}
				return lotteryRoutes.handleDraw(volunteer.id, balance, reserve, grant);
			}

			if (url.pathname === "/applicants" && req.method === "POST") {
				return applicantRoutes.handleCreate(req, volunteer.id);
			}

			const editMatch = url.pathname.match(/^\/applicants\/([^/]+)\/edit$/);
			if (editMatch?.[1] && req.method === "GET") {
				return applicantRoutes.edit(decodeURIComponent(editMatch[1]));
			}

			const applicantNotesMatch = url.pathname.match(
				/^\/applicants\/([^/]+)\/notes$/,
			);
			if (applicantNotesMatch?.[1] && req.method === "POST") {
				return applicantRoutes.handleUpdateNotes(
					decodeURIComponent(applicantNotesMatch[1]),
					req,
				);
			}

			const idMatch = url.pathname.match(/^\/applicants\/([^/]+)$/);
			if (idMatch?.[1]) {
				const id = decodeURIComponent(idMatch[1]);
				if (req.method === "PUT") {
					return applicantRoutes.handleUpdate(id, req, volunteer.id);
				}
				if (req.method === "DELETE") {
					return applicantRoutes.handleDelete(id, volunteer.id);
				}
			}

			return withSecurityHeaders(new Response("Not found", { status: 404 }));
		},
	});

	Bun.cron("* * * * *", async () => {
		try {
			await autoCloseExpiredLottery(pool, eventStore);
		} catch (_) {
			// Silently ignore — next tick will retry
		}
	});

	return server;
}
