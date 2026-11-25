import { privateMetadata } from "@/seo/metadata";
import { CirclePage } from "@/features/CirclePage";

// No generateStaticParams: one shell for every id, filled in by the client (the Worker serves it for /{locale}/c/{id}).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <CirclePage />;
}
