// Errors the API turns into plain answers: NotFound is a 404, BadInput a 400.
export class NotFound extends Error {}
export class BadInput extends Error {}
