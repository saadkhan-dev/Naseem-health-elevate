export const PHONE = "+92 315 2968384";
export const PHONE_TEL = "+923152968384";
export const WHATSAPP_NUMBER = "923152968384";
export const EMAIL = "rahatphysio9@gmail.com";

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const telUrl = `tel:${PHONE_TEL}`;
