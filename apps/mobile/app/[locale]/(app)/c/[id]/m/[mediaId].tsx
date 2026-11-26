import { privateMetadata } from "@/seo/metadata";
import { CircleTitle } from "@/features/diary/CircleTitle";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <CircleTitle />;
}
