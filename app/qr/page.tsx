import { redirect } from "next/navigation";

export default function QRReferralPage() {
  redirect("/?utm_source=festival_qr");
}