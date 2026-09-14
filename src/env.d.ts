type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
  }
}

declare namespace App {
	interface Locals extends Runtime {}
}
