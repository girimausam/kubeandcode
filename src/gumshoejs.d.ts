declare module 'gumshoejs' {
	interface GumshoeOptions {
		offset?: number;
		reflow?: boolean;
		nested?: boolean;
		nestedClass?: string;
		navClass?: string;
	}

	export default class Gumshoe {
		constructor(selector: string, options?: GumshoeOptions);
		destroy(): void;
	}
}
