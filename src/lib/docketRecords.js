// Docket's domain layer — tickets (intake) and devices (fleet ledger), stored
// as ordinary OKF notes distinguished by `type: Ticket` / `type: Device`. This
// deliberately shares the Notes folder and the generic parseNoteFields/
// buildNoteFields functions in notesOKF.js rather than inventing a second
// store: a ticket or device is a note, so it shows up in the regular Notes
// wiki and backlink graph like anything else.

import { parseNoteFields, buildNoteFields } from './notesOKF';

export const TICKET_STATUSES = ['open', 'assigned', 'mssp', 'closed'];
export const TICKET_CHANNELS = ['call', 'email', 'ticket', 'walk-in', 'other'];
export const DEVICE_STATUSES = ['assigned', 'spare', 'repair', 'retired', 'lost'];

export const TICKET_STATUS_LABELS = {
    open: 'Open',
    assigned: 'Assigned',
    mssp: 'Waiting on MSSP',
    closed: 'Closed',
};

export const DEVICE_STATUS_LABELS = {
    assigned: 'Assigned',
    spare: 'Spare',
    repair: 'In repair',
    retired: 'Retired',
    lost: 'Lost',
};

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

function timestampSlug() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function firstLine(text) {
    return String(text || '').trim().split('\n')[0].slice(0, 60);
}

async function listAllFiles(folder) {
    if (!folder || !window.electron?.listFiles) return [];
    try {
        const files = await window.electron.listFiles(folder);
        return (files || []).filter((f) => f.toLowerCase().endsWith('.md'));
    } catch {
        return [];
    }
}

async function readRecord(folder, fileName) {
    try {
        const content = await window.electron.readFile(`${folder}/${fileName}`);
        const { fields, body } = parseNoteFields(content);
        return { fileName, fields, body };
    } catch {
        return null;
    }
}

async function listByType(folder, type) {
    const files = await listAllFiles(folder);
    const records = await Promise.all(files.map((f) => readRecord(folder, f)));
    return records
        .filter((r) => r && r.fields.type === type)
        .sort((a, b) => String(b.fields.createdAt || '').localeCompare(String(a.fields.createdAt || '')));
}

export function listTickets(folder) {
    return listByType(folder, 'Ticket');
}

export function listDevices(folder) {
    return listByType(folder, 'Device');
}

export async function createTicket(folder, { channel, note }) {
    const now = new Date().toISOString();
    const fileName = `ticket-${timestampSlug()}.md`;
    const fields = {
        type: 'Ticket',
        title: firstLine(note) || 'Untitled ticket',
        status: 'open',
        channel: channel || 'other',
        createdAt: now,
        updatedAt: now,
    };
    const body = note || '';
    await window.electron.writeFile(`${folder}/${fileName}`, buildNoteFields(fields, body));
    return { fileName, fields, body };
}

export async function createDevice(folder, { assetTag, assignee, status }) {
    const slug = slugify(assetTag) || timestampSlug();
    const fileName = `device-${slug}.md`;
    const now = new Date().toISOString();
    const fields = {
        type: 'Device',
        title: assetTag || 'Untitled device',
        assetTag: assetTag || '',
        assignee: assignee || '',
        status: status || 'assigned',
        createdAt: now,
        updatedAt: now,
    };
    const body = '';
    await window.electron.writeFile(`${folder}/${fileName}`, buildNoteFields(fields, body));
    return { fileName, fields, body };
}

export async function updateRecord(folder, fileName, patch) {
    const content = await window.electron.readFile(`${folder}/${fileName}`);
    const { fields, body } = parseNoteFields(content);
    const nextFields = { ...fields, ...patch, updatedAt: new Date().toISOString() };
    await window.electron.writeFile(`${folder}/${fileName}`, buildNoteFields(nextFields, body));
    return { fileName, fields: nextFields, body };
}

export function linkedTicketsForDevice(tickets, assetTag) {
    if (!assetTag) return [];
    return tickets.filter((t) => t.fields.device === assetTag);
}
