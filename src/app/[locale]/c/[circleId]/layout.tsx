import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember } from "@/lib/data";
import { TabBar } from "@/components/tab-bar";
import { CircleMemory } from "@/components/circle-memory";

export default async function CircleLayout({ children, params }: LayoutProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  // Non-members get a 404, not a 403: a Cerchia's existence is private too.
  if (!(await getCircleForMember(circleId, user.id))) notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-[62rem] lg:flex-row lg:gap-8">
      <CircleMemory circleId={circleId} />
      <div className="projector flex-1 lg:order-2 lg:max-w-[40rem]">{children}</div>
      <TabBar circleId={circleId} />
    </div>
  );
}
