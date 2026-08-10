type MetaMediaDescriptor = {
  id?: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function graphBase() {
  return `https://graph.facebook.com/${required('META_GRAPH_VERSION')}`;
}

function metaError(data: MetaMediaDescriptor, fallback: string) {
  const meta = data.error;
  const suffix = meta?.code
    ? ` (Meta ${meta.code}${meta.error_subcode ? `/${meta.error_subcode}` : ''})`
    : '';
  return new Error(`${meta?.message || fallback}${suffix}`);
}

export async function getMetaMediaDescriptor(mediaId: string, accessToken: string) {
  const response = await fetch(`${graphBase()}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const data = await response.json() as MetaMediaDescriptor;
  if (!response.ok || !data.url) {
    throw metaError(data, `Não foi possível localizar a mídia no WhatsApp (HTTP ${response.status}).`);
  }
  return data;
}

export async function fetchMetaMedia(
  mediaId: string,
  accessToken: string,
  options: { range?: string | null } = {},
) {
  const descriptor = await getMetaMediaDescriptor(mediaId, accessToken);
  const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  if (options.range) headers.set('Range', options.range);

  const response = await fetch(descriptor.url!, {
    headers,
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 206) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Não foi possível baixar a mídia do WhatsApp (HTTP ${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}.`,
    );
  }

  return { descriptor, response };
}
