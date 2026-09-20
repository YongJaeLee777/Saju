type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    KAKAOPAY_SECRET_KEY?: string;
    KAKAOPAY_CALLBACK_ORIGIN?: string;
  }
}

declare namespace App {
	interface Locals extends Runtime {}
}
