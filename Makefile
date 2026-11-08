.PHONY: test typecheck validate

# Validates the manifest and hooks, then runs the tests with the desktop app's engine.
test:
	sh scripts/test.sh

# Uses the types the app writes in .claude-plugin/types/ once it has loaded the mod.
typecheck:
	@test -f .claude-plugin/types/tsconfig.json || { echo "Load the mod once in the app (or run claude --plugin-dir .) so it writes .claude-plugin/types/"; exit 1; }
	npx --yes --package typescript@5.6.3 tsc -p . --noEmit

# Everything a pull request has to pass.
validate: test typecheck
