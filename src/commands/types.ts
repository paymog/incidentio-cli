export type Command = {
  // Dispatch tokens, e.g. ["incidents", "list"].
  name: string[];
  method: string;
  // Path with :param placeholders, e.g. /v2/incidents/:id.
  path: string;
  // Ordered path params, e.g. ["id"]. Filled from --flags.
  pathParams: string[];
  // Known query param names, surfaced in `list` so users know what --query accepts.
  query: string[];
  bodyContentType?: string;
  description?: string;
};

// Dispatch: exact token match. The command surface is flat two-token names
// (`<resource> <verb>`), so an exact compare is all that's needed.
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
