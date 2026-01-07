import { BIA_WHATSAPP_NUMBER } from '../env';

export function formatPhoneBR(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
        const ddd = digits.slice(2, 4);
        const rest = digits.slice(4);
        const a = rest.slice(0, rest.length - 4);
        const b = rest.slice(-4);
        return `+55 (${ddd}) ${a}-${b}`;
    }
    return digits ? `+${digits}` : '';
}

export function buildWhatsAppReturnLink(): string | null {
    if (BIA_WHATSAPP_NUMBER) {
        return `https://wa.me/${BIA_WHATSAPP_NUMBER}`;
    }
    return 'whatsapp://send';
}
