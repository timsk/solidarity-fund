/** @internal - mutating this in tests requires resetting via setFundName() */
let _fundName = "Community Solidarity Fund";

export function setFundName(name: string): void {
	_fundName = name;
}

export function resetFundName(): void {
	_fundName = "Community Solidarity Fund";
}

export function getFundName(): string {
	return _fundName;
}

let _smsConfig: SmsConfig | null = null;

export type SmsLogLevel = "silent" | "warn" | "info" | "debug";

export type SmsConfig = {
	enabled: boolean;
	username: string;
	apiKey: string;
	fromName: string;
	logLevel: SmsLogLevel;
};

export function getSmsConfig(): SmsConfig {
	if (_smsConfig) return _smsConfig;

	const enabled = process.env.SMS_ENABLED === "true";
	const fromName = process.env.SMS_FROM_NAME ?? "CSF";
	const logLevel = (process.env.SMS_LOG_LEVEL ?? "warn") as SmsLogLevel;

	if (fromName.length > 11) {
		throw new Error("SMS_FROM_NAME must be 11 characters or fewer");
	}
	if (!["silent", "warn", "info", "debug"].includes(logLevel)) {
		throw new Error(
			`SMS_LOG_LEVEL must be one of: silent, warn, info, debug. Got: ${logLevel}`,
		);
	}

	if (enabled) {
		const username = process.env.CLICKSEND_USERNAME;
		const apiKey = process.env.CLICKSEND_API_KEY;
		if (!username || !apiKey) {
			throw new Error(
				"CLICKSEND_USERNAME and CLICKSEND_API_KEY are required when SMS_ENABLED=true",
			);
		}
		_smsConfig = { enabled: true, username, apiKey, fromName, logLevel };
	} else {
		_smsConfig = {
			enabled: false,
			username: "",
			apiKey: "",
			fromName,
			logLevel,
		};
	}
	return _smsConfig;
}

export function resetSmsConfig(): void {
	_smsConfig = null;
}

let _emailConfig: EmailConfig | null = null;

export type EmailConfig = {
	enabled: boolean;
	user: string;
	appPassword: string;
	fromName?: string;
};

export function getEmailConfig(): EmailConfig {
	if (_emailConfig) return _emailConfig;

	const enabled = process.env.EMAIL_ENABLED === "true";
	const user = process.env.GMAIL_USER ?? "";
	const appPassword = process.env.GMAIL_APP_PASSWORD ?? "";
	const fromName = process.env.EMAIL_FROM_NAME || user || undefined;

	if (enabled) {
		if (!user || !appPassword) {
			throw new Error(
				"GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_ENABLED=true",
			);
		}
		_emailConfig = { enabled: true, user, appPassword, fromName };
	} else {
		_emailConfig = { enabled: false, user, appPassword, fromName };
	}
	return _emailConfig;
}

export function resetEmailConfig(): void {
	_emailConfig = null;
}
