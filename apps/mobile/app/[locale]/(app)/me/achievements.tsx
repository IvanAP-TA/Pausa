import { privateMetadata } from "@/seo/metadata";
import { Achievements } from "@/features/achievements/Achievements";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Achievements />;
}
