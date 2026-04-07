// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module 'node-ical' {
	interface VEvent {
		type: 'VEVENT';
		start: Date;
		end: Date;
		summary?: string;
		location?: string;
		description?: string;
		[key: string]: unknown;
	}

	interface ICalComponent {
		[key: string]: VEvent | { type: string } | unknown;
	}

	export function parseICS(text: string): ICalComponent;
}

export {};
