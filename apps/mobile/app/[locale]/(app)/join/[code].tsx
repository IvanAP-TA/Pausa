import { privateMetadata } from "@/seo/metadata";
import { Join } from "@/features/Join";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Join />;
}
