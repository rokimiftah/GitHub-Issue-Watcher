import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
	html: {
		favicon: "https://cdn.rokimiftah.id/favicon.ico",
		meta: {
			charset: {
				charset: "UTF-8",
			},
			description:
				"Track GitHub issues with AI! Enter a repo and keyword, get relevant issues with scores, no scrolling needed.",
		},
		title: "GitHub Issue Watcher",
	},

	plugins: [pluginReact()],

	server: {
		host: "localhost",
		port: 3000,
	},
});
