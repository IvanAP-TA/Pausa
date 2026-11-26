import { privateMetadata } from "@/seo/metadata";
import { Feed } from "@/features/diary/Feed";

// As in v1, a Cerchia's own page is its diary. No generateStaticParams: one shell for every id, filled in by the client.
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Feed />;
}
