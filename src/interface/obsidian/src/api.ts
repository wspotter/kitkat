export async function deleteContentByType(KITUrl: string, KITApiKey: string, contentType: string): Promise<void> {
    // Deletes all content of a given type on KIT server for Obsidian client
    const response = await fetch(`${KITUrl}/api/content/type/${contentType}?client=obsidian`, {
        method: 'DELETE',
        headers: KITApiKey ? { 'Authorization': `Bearer ${KITApiKey}` } : {},
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to delete content type ${contentType}: ${response.status} ${text}`);
    }
}

export async function uploadContentBatch(KITUrl: string, KITApiKey: string, files: { blob: Blob, path: string }[]): Promise<string> {
    // Uploads a batch of files to KIT content endpoint
    const formData = new FormData();
    files.forEach(fileItem => { formData.append('files', fileItem.blob, fileItem.path); });

    const response = await fetch(`${KITUrl}/api/content?client=obsidian`, {
        method: 'PATCH',
        headers: KITApiKey ? { 'Authorization': `Bearer ${KITApiKey}` } : {},
        body: formData,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to upload batch: ${response.status} ${text}`);
    }

    return await response.text();
}
