import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { exportAccountData } from "@/lib/core/account";

/** The signed-in person's own data as a JSON download (GDPR access/portability). Guests have nothing to export. */
export async function GET() {
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) return new Response("Unauthorized", { status: 401 });
  const data = await exportAccountData(await getDb(), session.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="pausa-data.json"',
      "cache-control": "no-store",
    },
  });
}
