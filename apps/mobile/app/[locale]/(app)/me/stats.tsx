import { privateMetadata } from "@/seo/metadata";
import { Stats } from "@/features/achievements/Stats";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Stats />;
}
