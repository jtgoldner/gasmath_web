// Diagnostic endpoint with zero imports: if this fails too, the problem is
// the function runtime configuration, not our code's imports.
export default function handler(_req: unknown, res: any): void {
  res.status(200).json({ ok: true, node: process.version });
}
