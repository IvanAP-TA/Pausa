import { privateMetadata } from "@/seo/metadata";
import { Ranking } from "@/features/stats/Ranking";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Ranking />;
}
