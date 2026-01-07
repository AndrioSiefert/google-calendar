import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from './env';
import { escapeHtml, renderTemplate } from './utils/html';

const successTemplatePath = path.join(PROJECT_ROOT, 'public', 'templates', 'success.html');
const errorTemplatePath = path.join(PROJECT_ROOT, 'public', 'templates', 'error.html');

let SUCCESS_HTML = '';
let ERROR_HTML = '';

function loadTemplates() {
    try {
        SUCCESS_HTML = fs.readFileSync(successTemplatePath, 'utf8');
    } catch (err) {
        console.error('Falha ao ler template success.html:', err);
        SUCCESS_HTML = '<html><body><h1>{{TITLE}}</h1>{{SUBTITLE_BLOCK}}{{DETAILS_BLOCK}}{{RETURN_LINK_BLOCK}}{{AUTO_REDIRECT}}</body></html>';
    }

    try {
        ERROR_HTML = fs.readFileSync(errorTemplatePath, 'utf8');
    } catch (err) {
        console.error('Falha ao ler template error.html:', err);
        ERROR_HTML = '<html><body><h1>{{TITLE}}</h1><div>{{DETAILS}}</div></body></html>';
    }
}

loadTemplates();

export function renderSuccessPage(params: {
    title: string;
    subtitle?: string;
    details?: string;
    returnLink?: string | null;
    returnLabel?: string;
}) {
    const title = escapeHtml(params.title);
    const subtitle = escapeHtml(params.subtitle || '');
    const details = escapeHtml(params.details || '');

    const returnLink = params.returnLink || '';
    const returnLabel = escapeHtml(params.returnLabel || 'Voltar para o WhatsApp');

    const hasReturnLink = Boolean(returnLink);

    const autoRedirect = hasReturnLink
        ? `\n<script>\nsetTimeout(()=>{try{window.location.href=${JSON.stringify(returnLink)};}catch(e){}},2000);\n</script>\n`
        : '';

    const subtitleBlock = subtitle ? `<p>${subtitle}</p>` : '';
    const detailsBlock = details ? `<div class="details">${details}</div>` : '';

    return renderTemplate(SUCCESS_HTML, {
        TITLE: title,
        SUBTITLE: subtitle,
        DETAILS: details,
        SUBTITLE_BLOCK: subtitleBlock,
        DETAILS_BLOCK: detailsBlock,
        RETURN_LINK: escapeHtml(returnLink),
        RETURN_LABEL: returnLabel,
        RETURN_LINK_BLOCK: hasReturnLink
            ? `<a class="btn" href="${escapeHtml(returnLink)}">${returnLabel}</a>`
            : '',
        AUTO_REDIRECT: autoRedirect,
    });
}

export function renderErrorPage(title: string, details?: string) {
    const d = escapeHtml(details || "");
    return renderTemplate(ERROR_HTML, {
        TITLE: escapeHtml(title),
        DETAILS: d,
        DETAILS_BLOCK: d ? `<div class="details">${d}</div>` : "",
    });
}
