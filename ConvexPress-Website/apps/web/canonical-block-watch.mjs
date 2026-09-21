import { relative, resolve } from "node:path";

/** Discover renderer additions/removals outside the Website and demo Vite roots. */
export function canonicalBlockWatch({ root, discoveryId, debounceMs = 40 }) {
	return {
		name: "canonical-renderer-discovery-watch",
		apply: "serve",
		configureServer(server) {
			const canonicalRoot = resolve(root);
			const importer = resolve(discoveryId);
			let timer;
			let closed = false;
			const onMembershipChange = (file) => {
				const path = relative(canonicalRoot, resolve(file)).replaceAll(
					"\\",
					"/",
				);
				if (!/^[^./][^/]*\/[^./][^/]*\/render\.tsx$/.test(path)) return;
				// Initial watcher enumeration must not cause a reload before discovery is loaded.
				const graphs = Object.values(server.environments).map(environment => environment.moduleGraph);
				if (!graphs.some(graph => graph.getModuleById(importer))) return;
				clearTimeout(timer);
				timer = setTimeout(() => {
					if (closed) return;
					for (const environment of Object.values(server.environments)) {
						const module = environment.moduleGraph.getModuleById(importer);
						if (module) environment.moduleGraph.invalidateModule(module);
					}
					server.ws.send({ type: "full-reload", path: "*" });
				}, debounceMs);
			};
			server.watcher.on("add", onMembershipChange);
			server.watcher.on("unlink", onMembershipChange);
			server.watcher.add(canonicalRoot);
			server.httpServer?.once("close", () => {
				closed = true;
				clearTimeout(timer);
				server.watcher.off("add", onMembershipChange);
				server.watcher.off("unlink", onMembershipChange);
			});
		},
	};
}
