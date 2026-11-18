import { redirect } from "next/navigation";

/** Import moved to the personal space: what you bring in is yours first, and you share it from there. */
export default async function OldImport({ params }: PageProps<"/[locale]/c/[circleId]/import">) {
  const { locale } = await params;
  redirect(`/${locale}/me/import`);
}
