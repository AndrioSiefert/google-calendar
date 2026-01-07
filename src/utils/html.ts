export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderTemplate(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{([A-Z0-9_]+)\}\}/gi, (_m, key) => vars[key] ?? '');
}
