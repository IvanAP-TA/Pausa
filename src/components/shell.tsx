import { CircleAside } from "./circle-aside";
import { CircleMemory } from "./circle-memory";
import { SpaceSwitch } from "./space-switch";
import { TabBar } from "./tab-bar";

type Circle = { id: string; name: string };
type Me = { id: string; name: string; image?: string | null };

/**
 * The frame of every signed-in page: the bar on top (where am I, switch Cerchia, the bell), the page, and the tabs under
 * the thumb (a rail on the left from 64rem) with my profile as the last tab. The same in a Cerchia, on my profile and in
 * the settings, so moving between them never changes the furniture. `circle` is the Cerchia the tabs lead to (the one I
 * am in, or the last one I visited); with none, only the top bar is drawn. `aside`: from 80rem a Cerchia also gets a
 * second column (what to watch together, the top of the ranking), loaded only on screens that wide.
 */
export function Shell({ circle, circles, me, unread = 0, remember = false, aside = false, children }: {
  circle: Circle | null; circles: Circle[]; me: Me; unread?: number; remember?: boolean; aside?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-[62rem] lg:flex-row lg:gap-8 xl:max-w-[82rem] xl:gap-10">
      {remember && circle && <CircleMemory circleId={circle.id} />}
      <div className="projector flex-1 lg:order-2 lg:max-w-[40rem]">
        <SpaceSwitch circle={circle} circles={circles} unread={unread} />
        {children}
      </div>
      {circle && <TabBar circleId={circle.id} me={me} />}
      {circle && aside && <CircleAside circleId={circle.id} />}
    </div>
  );
}
