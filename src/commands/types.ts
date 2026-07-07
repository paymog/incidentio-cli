export type Command = {
  // Dispatch tokens, e.g. ["incidents", "list"].
  name: string[];
  method: string;
  // Path with :param placeholders, e.g. /v2/incidents/:id or /api/saved_views.
  path: string;
  // Ordered path params, e.g. ["id"]. Filled from --flags.
  pathParams: string[];
  // Known query param names, surfaced in `list` so users know what --query accepts.
  query: string[];
  bodyContentType?: string;
  description?: string;
  // "bearer" (public API, default) or "cookie" (dashboard internal API).
  auth?: "bearer" | "cookie";
};

// Dispatch: exact token match. Most names are two tokens (`<resource> <verb>`),
// but internal/dashboard names can be longer (e.g. `insights trends`), so we match
// on length + equality rather than assuming a fixed arity.
export function findCommand(
  commands: Command[],
  tokens: string[],
): Command | undefined {
  return commands.find(
    (c) =>
      c.name.length === tokens.length &&
      c.name.every((n, i) => n === tokens[i]),
  );
}
