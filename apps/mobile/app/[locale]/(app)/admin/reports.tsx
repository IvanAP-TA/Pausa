import { privateMetadata } from "@/seo/metadata";
import { Reports } from "@/features/admin/Reports";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Reports />;
}
