import { privateMetadata } from "@/seo/metadata";
import { Review } from "@/features/admin/Review";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Review />;
}
