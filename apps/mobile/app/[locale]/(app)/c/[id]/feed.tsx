import { privateMetadata } from "@/seo/metadata";
import { Feed } from "@/features/diary/Feed";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Feed />;
}
