import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web";

type PatchElementsOptions = {
	selector?: string;
	mode?:
		| "outer"
		| "inner"
		| "replace"
		| "prepend"
		| "append"
		| "before"
		| "after"
		| "remove";
};

type SSEAction = (stream: ServerSentEventGenerator) => void;

export function patchElements(
	html: string,
	options?: PatchElementsOptions,
): SSEAction {
	return (stream) => stream.patchElements(html, options);
}

// fallow-ignore-next-line unused-exports
export function patchSignals(signals: Record<string, unknown>): SSEAction {
	return (stream) => stream.patchSignals(JSON.stringify(signals));
}

// fallow-ignore-next-line unused-exports
export function removeElements(selector: string): SSEAction {
	return (stream) => stream.removeElements(selector);
}

export function redirectTo(url: string): SSEAction {
	if (!url.startsWith("/")) {
		throw new Error(`redirectTo: only relative paths are allowed, got: ${url}`);
	}
	if (url.includes("</script>") || url.includes("\0")) {
		throw new Error(`redirectTo: URL contains unsafe sequences`);
	}
	const safeUrl = url.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	return (stream) =>
		stream.executeScript(`window.location.href = '${safeUrl}'`);
}

export function sseResponse(...actions: SSEAction[]): Response {
	return ServerSentEventGenerator.stream((stream) => {
		for (const action of actions) {
			action(stream);
		}
	});
}

export { ServerSentEventGenerator };
