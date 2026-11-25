import { privateMetadata } from "@/seo/metadata";
import { ListsOverview } from "@/features/lists/ListsOverview";

// /{locale}/lists, optionally ?circle=<id> (which Cerchia to show) and ?add=<mediaId> (choose a list for that title).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <ListsOverview />;
}
