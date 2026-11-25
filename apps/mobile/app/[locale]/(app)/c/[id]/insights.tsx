import { privateMetadata } from "@/seo/metadata";
import { Insights } from "@/features/stats/Insights";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Insights />;
}
