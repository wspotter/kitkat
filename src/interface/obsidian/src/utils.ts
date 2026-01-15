import { FileSystemAdapter, Notice, Vault, Modal, TFile, request, setIcon, Editor, WorkspaceLeaf } from 'obsidian';
import { KITSetting, ModelOption, ServerUserConfig, UserInfo } from 'src/settings'
import { deleteContentByType, uploadContentBatch } from './api';
import { KITSearchModal } from './search_modal';

export function getVaultAbsolutePath(vault: Vault): string {
    let adaptor = vault.adapter;
    if (adaptor instanceof FileSystemAdapter) {
        return adaptor.getBasePath();
    }
    return '';
}

function fileExtensionToMimeType(extension: string): string {
    switch (extension) {
        case 'pdf':
            return 'application/pdf';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'md':
        case 'markdown':
            return 'text/markdown';
        case 'org':
            return 'text/org';
        default:
            return 'text/plain';
    }
}

function filenameToMimeType(filename: TFile): string {
    switch (filename.extension) {
        case 'pdf':
            return 'application/pdf';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'md':
        case 'markdown':
            return 'text/markdown';
        case 'org':
            return 'text/org';
        default:
            console.warn(`Unknown file type: ${filename.extension}. Defaulting to text/plain.`);
            return 'text/plain';
    }
}

export const fileTypeToExtension = {
    'pdf': ['pdf'],
    'image': ['png', 'jpg', 'jpeg', 'webp'],
    'markdown': ['md', 'markdown'],
};
export const supportedImageFilesTypes = fileTypeToExtension.image;
export const supportedBinaryFileTypes = fileTypeToExtension.pdf.concat(supportedImageFilesTypes);
export const supportedFileTypes = fileTypeToExtension.markdown.concat(supportedBinaryFileTypes);

export function getFilesToSync(vault: Vault, setting: KITSetting): TFile[] {
    const files = vault.getFiles()
        // Filter supported file types for syncing
        .filter(file => supportedFileTypes.includes(file.extension))
        // Filter user configured file types for syncing
        .filter(file => {
            if (fileTypeToExtension.markdown.includes(file.extension)) return setting.syncFileType.markdown;
            if (fileTypeToExtension.pdf.includes(file.extension)) return setting.syncFileType.pdf;
            if (fileTypeToExtension.image.includes(file.extension)) return setting.syncFileType.images;
            return false;
        })
        // Filter in included folders
        .filter(file => {
            // If no folders are specified, sync all files
            if (setting.syncFolders.length === 0) return true;
            // Otherwise, check if the file is in one of the specified folders
            return setting.syncFolders.some(folder =>
                file.path.startsWith(folder + '/') || file.path === folder
            );
        })
        // Filter out excluded folders
        .filter(file => {
            // If no folders are excluded, include all files
            if (setting.excludeFolders.length === 0) return true;
            // Exclude files in any of the excluded folders
            return !setting.excludeFolders.some(folder =>
                file.path.startsWith(folder + '/') || file.path === folder
            );
        })
        // Sort files by type: markdown > pdf > image
        .sort((a, b) => {
            const typeOrder: (keyof typeof fileTypeToExtension)[] = ['markdown', 'pdf', 'image'];
            const aType = typeOrder.findIndex(type => fileTypeToExtension[type].includes(a.extension));
            const bType = typeOrder.findIndex(type => fileTypeToExtension[type].includes(b.extension));
            return aType - bType;
        });

    return files;
}

export async function updateContentIndex(
    vault: Vault,
    setting: KITSetting,
    lastSync: Map<TFile, number>,
    regenerate: boolean = false,
    userTriggered: boolean = false,
    onProgress?: (progress: { processed: number, total: number }) => void
): Promise<Map<TFile, number>> {
    // Get all markdown, pdf files in the vault
    console.log(`KIT: Updating KIT content index...`);
    const files = getFilesToSync(vault, setting);
    console.log(`KIT: Found ${files.length} eligible files in vault`);

    let countOfFilesToIndex = 0;
    let countOfFilesToDelete = 0;
    lastSync = lastSync.size > 0 ? lastSync : new Map<TFile, number>();

    // Count files that need indexing (modified since last sync or regenerating)
    const filesToSync = regenerate
        ? files
        : files.filter(file => file.stat.mtime >= (lastSync.get(file) ?? 0));

    // Show notice with file counts when user triggers sync
    if (userTriggered) {
        new Notice(`🔄 Syncing ${filesToSync.length} of ${files.length} files to KIT...`);
    }
    console.log(`KIT: ${filesToSync.length} files to sync (${files.length} total eligible)`);

    // Add all files to index as multipart form data, batched by size, item count
    const MAX_BATCH_SIZE = 10 * 1024 * 1024; // 10MB max batch size
    const MAX_BATCH_ITEMS = 50; // Max 50 items per batch
    let fileData: { blob: Blob, path: string }[][] = [];
    let currentBatch: { blob: Blob, path: string }[] = [];
    let currentBatchSize = 0;

    for (const file of files) {
        // Only push files that have been modified since last sync if not regenerating
        if (!regenerate && file.stat.mtime < (lastSync.get(file) ?? 0)) {
            continue;
        }

        countOfFilesToIndex++;
        const encoding = supportedBinaryFileTypes.includes(file.extension) ? "binary" : "utf8";
        const mimeType = fileExtensionToMimeType(file.extension) + (encoding === "utf8" ? "; charset=UTF-8" : "");
        const fileContent = encoding == 'binary' ? await vault.readBinary(file) : await vault.read(file);
        const fileItem = { blob: new Blob([fileContent], { type: mimeType }), path: file.path };

        const fileSize = (typeof fileContent === 'string') ? new Blob([fileContent]).size : fileContent.byteLength;
        if ((currentBatchSize + fileSize > MAX_BATCH_SIZE || currentBatch.length >= MAX_BATCH_ITEMS) && currentBatch.length > 0) {
            fileData.push(currentBatch);
            currentBatch = [];
            currentBatchSize = 0;
        }

        currentBatch.push(fileItem);
        currentBatchSize += fileSize;
    }

    // Add files to delete (previously synced but no longer in vault) to final batch
    let filesToDelete: TFile[] = [];
    for (const lastSyncedFile of lastSync.keys()) {
        if (!files.includes(lastSyncedFile)) {
            countOfFilesToDelete++;
            const fileObj = new Blob([""], { type: filenameToMimeType(lastSyncedFile) });
            currentBatch.push({ blob: fileObj, path: lastSyncedFile.path });
            filesToDelete.push(lastSyncedFile);
        }
    }

    // Add final batch if not empty
    if (currentBatch.length > 0) {
        fileData.push(currentBatch);
    }

    // Delete all files of enabled content types first if regenerating
    let error_message: string | null = null;
    if (regenerate) {
        // Mark content types to delete based on user sync file type settings
        const contentTypesToDelete: string[] = [];
        if (setting.syncFileType.markdown) contentTypesToDelete.push('markdown');
        if (setting.syncFileType.pdf) contentTypesToDelete.push('pdf');
        if (setting.syncFileType.images) contentTypesToDelete.push('image');

        try {
            for (const contentType of contentTypesToDelete) {
                await deleteContentByType(setting.KITUrl, setting.KITApiKey, contentType);
            }
        } catch (err) {
            console.error('KIT: Error deleting content types:', err);
            error_message = "❗️Failed to clear existing content index";
            fileData = [];
        }
    }

    // Upload files in batches
    let responses: string[] = [];
    let processedFiles = 0;
    const totalFiles = fileData.reduce((sum, batch) => sum + batch.length, 0);

    // Report initial progress with total count before uploading
    if (onProgress) {
        onProgress({ processed: 0, total: totalFiles });
    }

    for (const batch of fileData) {
        try {
            const resultText = await uploadContentBatch(setting.KITUrl, setting.KITApiKey, batch);
            responses.push(resultText);
            processedFiles += batch.length;
            if (onProgress) {
                onProgress({ processed: processedFiles, total: totalFiles });
            }
        } catch (err: any) {
            console.error('KIT: Failed to upload batch:', err);
            if (err.message?.includes('429')) {
                error_message = `❗️Requests were throttled. Upgrade your subscription or try again later.`;
            } else {
                error_message = `❗️Failed to sync content with KIT server. Error: ${err.message ?? String(err)}`;
            }
            break;
        }
    }

    // Update last sync time for each successfully indexed file
    files
        .filter(file => responses.find(response => response.includes(file.path)))
        .reduce((newSync, file) => {
            newSync.set(file, new Date().getTime());
            return newSync;
        }, lastSync);

    // Remove files that were deleted from last sync
    filesToDelete
        .filter(file => responses.find(response => response.includes(file.path)))
        .forEach(file => lastSync.delete(file));

    if (error_message) {
        new Notice(error_message);
    } else {
        const summary = `Updated ${countOfFilesToIndex}, deleted ${countOfFilesToDelete} files`;
        if (userTriggered) new Notice(`✅ ${summary}`);
        console.log(`✅ Refreshed KIT content index. ${summary}.`);
    }

    return lastSync;
}

export async function openKITPluginSettings(): Promise<void> {
    const setting = this.app.setting;
    await setting.open();
    setting.openTabById('KIT');
}

export async function createNote(name: string, newLeaf = false): Promise<void> {
    try {
        let pathPrefix: string
        switch (this.app.vault.getConfig('newFileLocation')) {
            case 'current':
                pathPrefix = (this.app.workspace.getActiveFile()?.parent.path ?? '') + '/'
                break
            case 'folder':
                pathPrefix = this.app.vault.getConfig('newFileFolderPath') + '/'
                break
            default: // 'root'
                pathPrefix = ''
                break
        }
        await this.app.workspace.openLinkText(`${pathPrefix}${name}.md`, '', newLeaf)
    } catch (e) {
        console.error('KIT: Could not create note.\n' + (e as any).message);
        throw e
    }
}

export async function createNoteAndCloseModal(query: string, modal: Modal, opt?: { newLeaf: boolean }): Promise<void> {
    try {
        await createNote(query, opt?.newLeaf);
    }
    catch (e) {
        new Notice((e as Error).message)
        return
    }
    modal.close();
}

export async function canConnectToBackend(
    KITUrl: string,
    KITApiKey: string,
    showNotice: boolean = false
): Promise<{ connectedToBackend: boolean; statusMessage: string, userInfo: UserInfo | null }> {
    let connectedToBackend = false;
    let userInfo: UserInfo | null = null;

    if (!!KITUrl) {
        let headers = !!KITApiKey ? { "Authorization": `Bearer ${KITApiKey}` } : undefined;
        try {
            let response = await request({ url: `${KITUrl}/api/v1/user`, method: "GET", headers: headers })
            connectedToBackend = true;
            userInfo = JSON.parse(response);
        } catch (error) {
            connectedToBackend = false;
            console.log(`KIT connection error:\n\n${error}`);
        };
    }

    let statusMessage: string = getBackendStatusMessage(connectedToBackend, userInfo?.email, KITUrl, KITApiKey);
    if (showNotice) new Notice(statusMessage);
    return { connectedToBackend, statusMessage, userInfo };
}

export function getBackendStatusMessage(
    connectedToServer: boolean,
    userEmail: string | undefined,
    KITUrl: string,
    KITApiKey: string
): string {
    // Welcome message with default settings. KIT cloud always expects an API key.
    if (!KITApiKey && KITUrl === 'https://app.KIT.dev')
        return `🌈 Welcome to KIT! Get your API key from ${KITUrl}/settings#clients and set it in the KIT plugin settings on Obsidian`;

    if (!connectedToServer)
        return `❗️Could not connect to KIT at ${KITUrl}. Ensure your can access it`;
    else if (!userEmail)
        return `✅ Connected to KIT. ❗️Get a valid API key from ${KITUrl}/settings#clients to log in`;
    else if (userEmail === 'default@example.com')
        // Logged in as default user in anonymous mode
        return `✅ Welcome back to KIT`;
    else
        return `✅ Welcome back to KIT, ${userEmail}`;
}

export async function populateHeaderPane(headerEl: Element, setting: KITSetting, viewType: string): Promise<void> {
    let userInfo: UserInfo | null = null;
    try {
        const { userInfo: extractedUserInfo } = await canConnectToBackend(setting.KITUrl, setting.KITApiKey, false);
        userInfo = extractedUserInfo;
    } catch (error) {
        console.error("❗️Could not connect to KIT");
    }

    // Add KIT title to header element
    const titlePaneEl = headerEl.createDiv();
    titlePaneEl.className = 'KIT-header-title-pane';
    const titleEl = titlePaneEl.createDiv();
    titleEl.className = 'KIT-logo';
    titleEl.textContent = "KIT";

    // Populate the header element with the navigation pane
    // Create the nav element
    const nav = titlePaneEl.createEl('nav');
    nav.className = 'KIT-nav';

    // Create the title pane element
    titlePaneEl.appendChild(titleEl);
    titlePaneEl.appendChild(nav);

    // Create the chat link
    const chatLink = nav.createEl('a');
    chatLink.id = 'chat-nav';
    chatLink.className = 'KIT-nav chat-nav';
    chatLink.dataset.view = KITView.CHAT;

    // Create the chat icon
    const chatIcon = chatLink.createEl('span');
    chatIcon.className = 'KIT-nav-icon KIT-nav-icon-chat';
    setIcon(chatIcon, 'KIT-chat');

    // Create the chat text
    const chatText = chatLink.createEl('span');
    chatText.className = 'KIT-nav-item-text';
    chatText.textContent = 'Chat';

    // Append the chat icon and text to the chat link
    chatLink.appendChild(chatIcon);
    chatLink.appendChild(chatText);

    // Create the search link
    const searchLink = nav.createEl('a');
    searchLink.id = 'search-nav';
    searchLink.className = 'KIT-nav search-nav';

    // Create the search icon
    const searchIcon = searchLink.createEl('span');
    searchIcon.className = 'KIT-nav-icon KIT-nav-icon-search';
    setIcon(searchIcon, 'KIT-search');

    // Create the search text
    const searchText = searchLink.createEl('span');
    searchText.className = 'KIT-nav-item-text';
    searchText.textContent = 'Search';

    // Append the search icon and text to the search link
    searchLink.appendChild(searchIcon);
    searchLink.appendChild(searchText);

    // Create the similar link
    const similarLink = nav.createEl('a');
    similarLink.id = 'similar-nav';
    similarLink.className = 'KIT-nav similar-nav';
    similarLink.dataset.view = KITView.SIMILAR;

    // Create the similar icon
    const similarIcon = similarLink.createEl('span');
    similarIcon.id = 'similar-nav-icon';
    similarIcon.className = 'KIT-nav-icon KIT-nav-icon-similar';
    setIcon(similarIcon, 'webhook');

    // Create the similar text
    const similarText = similarLink.createEl('span');
    similarText.className = 'KIT-nav-item-text';
    similarText.textContent = 'Similar';

    // Append the similar icon and text to the similar link
    similarLink.appendChild(similarIcon);
    similarLink.appendChild(similarText);

    // Helper to get the current KIT leaf if active
    const getCurrentKITLeaf = (): WorkspaceLeaf | undefined => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view &&
            (activeLeaf.view.getViewType() === KITView.CHAT || activeLeaf.view.getViewType() === KITView.SIMILAR)) {
            return activeLeaf;
        }
        return undefined;
    };

    // Add event listeners to the navigation links
    // Chat link event listener
    chatLink.addEventListener('click', () => {
        // Get the activateView method from the plugin instance
        const KITPlugin = this.app.plugins.plugins.KIT;
        KITPlugin?.activateView(KITView.CHAT, getCurrentKITLeaf());
    });

    // Search link event listener
    searchLink.addEventListener('click', () => {
        // Open the search modal
        new KITSearchModal(this.app, setting).open();
    });

    // Similar link event listener
    similarLink.addEventListener('click', () => {
        // Get the activateView method from the plugin instance
        const KITPlugin = this.app.plugins.plugins.KIT;
        KITPlugin?.activateView(KITView.SIMILAR, getCurrentKITLeaf());
    });

    // Append the nav items to the nav element
    nav.appendChild(chatLink);
    nav.appendChild(searchLink);
    nav.appendChild(similarLink);

    // Append the title and new chat container to the header element
    headerEl.appendChild(titlePaneEl);

    if (viewType === KITView.CHAT) {
        // Create subtitle pane for New Chat button and agent selector
        const newChatEl = headerEl.createDiv("KIT-header-right-container");

        // Add agent selector container
        const agentContainer = newChatEl.createDiv("KIT-header-agent-container");

        // Add agent selector
        agentContainer.createEl("select", {
            attr: {
                class: "KIT-header-agent-select",
                id: "KIT-header-agent-select"
            }
        });

        // Add New Chat button
        const newChatButton = newChatEl.createEl('button');
        newChatButton.className = 'KIT-header-new-chat-button';
        newChatButton.title = 'Start New Chat (Ctrl+Alt+N)';
        setIcon(newChatButton, 'plus-circle');
        newChatButton.textContent = 'New Chat';

        // Add event listener to the New Chat button
        newChatButton.addEventListener('click', () => {
            const KITPlugin = this.app.plugins.plugins.KIT;
            if (KITPlugin) {
                // First activate the chat view
                KITPlugin.activateView(KITView.CHAT).then(() => {
                    // Then create a new conversation
                    setTimeout(() => {
                        // Access the chat view directly from the leaf after activation
                        const leaves = this.app.workspace.getLeavesOfType(KITView.CHAT);
                        if (leaves.length > 0) {
                            const chatView = leaves[0].view;
                            if (chatView && typeof chatView.createNewConversation === 'function') {
                                chatView.createNewConversation();
                            }
                        }
                    }, 100);
                });
            }
        });

        // Append the new chat container to the header element
        headerEl.appendChild(newChatEl);
    }

    // Update active state based on current view
    const updateActiveState = () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return;

        const viewType = activeLeaf.view?.getViewType();

        // Remove active class from all links
        chatLink.classList.remove('KIT-nav-selected');
        similarLink.classList.remove('KIT-nav-selected');

        // Add active class to the current view link
        if (viewType === KITView.CHAT) {
            chatLink.classList.add('KIT-nav-selected');
        } else if (viewType === KITView.SIMILAR) {
            similarLink.classList.add('KIT-nav-selected');
        }
    };

    // Initial update
    updateActiveState();

    // Register event for workspace changes
    this.app.workspace.on('active-leaf-change', updateActiveState);
}

export enum KITView {
    CHAT = "KIT-chat-view",
    SIMILAR = "KIT-similar-view",
}

function copyParentText(event: MouseEvent, message: string, originalButton: string) {
    const button = event.currentTarget as HTMLElement;
    if (!button || !button?.parentNode?.textContent) return;
    if (!!button.firstChild) button.removeChild(button.firstChild as HTMLImageElement);
    const textContent = message ?? button.parentNode.textContent.trim();
    navigator.clipboard.writeText(textContent).then(() => {
        setIcon((button as HTMLElement), 'copy-check');
        setTimeout(() => {
            setIcon((button as HTMLElement), originalButton);
        }, 1000);
    }).catch((error) => {
        console.error("Error copying text to clipboard:", error);
        const originalButtonText = button.innerHTML;
        setIcon((button as HTMLElement), 'x-circle');
        setTimeout(() => {
            button.innerHTML = originalButtonText;
            setIcon((button as HTMLElement), originalButton);
        }, 2000);
    });

    return textContent;
}

export function createCopyParentText(message: string, originalButton: string = 'copy-plus') {
    return function (event: MouseEvent) {
        let markdownMessage = copyParentText(event, message, originalButton);
        // Convert edit blocks back to markdown format before pasting
        const editRegex = /<details class="KIT-edit-accordion">[\s\S]*?<pre><code class="language-KIT-edit">([\s\S]*?)<\/code><\/pre>[\s\S]*?<\/details>/g;
        markdownMessage = markdownMessage?.replace(editRegex, (_, content) => {
            return `<KIT-edit>\n${content}\n</KIT-edit>`;
        });
        return markdownMessage;
    }
}

export function jumpToPreviousView() {
    const editor: Editor = this.app.workspace.getActiveFileView()?.editor
    if (!editor) return;
    editor.focus();
}

export function pasteTextAtCursor(text: string | undefined) {
    // Get the current active file's editor
    const editor: Editor = this.app.workspace.getActiveFileView()?.editor
    if (!editor || !text) return;
    const cursor = editor.getCursor();
    // If there is a selection, replace it with the text
    if (editor?.getSelection()) {
        editor.replaceSelection(text);
        // If there is no selection, insert the text at the cursor position
    } else if (cursor) {
        editor.replaceRange(text, cursor);
    }
}

export function getFileFromPath(sourceFiles: TFile[], chosenFile: string): TFile | undefined {
    // Find the vault file matching file of chosen file, entry
    let fileMatch = sourceFiles
        // Sort by descending length of path
        // This finds longest path match when multiple files have same name
        .sort((a, b) => b.path.length - a.path.length)
        // The first match is the best file match across OS
        // e.g. KIT server on Linux, Obsidian vault on Android
        .find(file => chosenFile.replace(/\\/g, "/").endsWith(file.path))
    return fileMatch;
}

export function getLinkToEntry(sourceFiles: TFile[], chosenFile: string, chosenEntry: string): string | undefined {
    // Find the vault file matching file of chosen file, entry
    let fileMatch = getFileFromPath(sourceFiles, chosenFile);

    // Return link to vault file at heading of chosen search result
    if (fileMatch) {
        let resultHeading = fileMatch.extension !== 'pdf' ? chosenEntry.split('\n', 1)[0] : '';
        let linkToEntry = resultHeading.startsWith('#') ? `${fileMatch.path}${resultHeading}` : fileMatch.path;
        console.log(`Link: ${linkToEntry}, File: ${fileMatch.path}, Heading: ${resultHeading}`);
        return linkToEntry;
    }
}

/**
 * Calculate estimated vault sync metrics (used and total bytes).
 * This is a client-side estimation based on the configured sync file types and folders.
 * The storage limit is determined from the backend-provided `setting.userInfo?.is_active` flag:
 * - if true => premium limit (500 MB)
 * - otherwise => free limit (10 MB)
 * This avoids client-side heuristics and relies on server-provided user info.
 */
export async function calculateVaultSyncMetrics(vault: Vault, setting: KITSetting): Promise<{ usedBytes: number, totalBytes: number }> {
    try {
        const files = getFilesToSync(vault, setting);
        const usedBytes = files.reduce((acc, file) => acc + (file.stat?.size ?? 0), 0);

        // Default to free plan limit
        const FREE_LIMIT = 10 * 1024 * 1024; // 10 MB
        const PAID_LIMIT = 500 * 1024 * 1024; // 500 MB
        let totalBytes = FREE_LIMIT;

        // Determine plan from backend-provided user info. Use FREE_LIMIT as default when info missing.
        try {
            if (setting.userInfo && setting.userInfo.is_active === true) {
                totalBytes = PAID_LIMIT;
            } else {
                totalBytes = FREE_LIMIT;
            }
        } catch (err) {
            // Defensive: on any unexpected error, fall back to free limit
            console.warn('KIT: Error reading userInfo.is_active, defaulting to free limit', err);
            totalBytes = FREE_LIMIT;
        }

        return { usedBytes, totalBytes };
    } catch (err) {
        console.error('KIT: Error calculating vault sync metrics:', err);
        return { usedBytes: 0, totalBytes: 10 * 1024 * 1024 };
    }
}

export async function fetchChatModels(settings: KITSetting): Promise<ModelOption[]> {
    if (!settings.connectedToBackend || !settings.KITUrl) {
        return [];
    }
    try {
        const response = await fetch(`${settings.KITUrl}/api/model/chat/options`, {
            method: 'GET',
            headers: settings.KITApiKey ? { 'Authorization': `Bearer ${settings.KITApiKey}` } : {},
        });
        if (response.ok) {
            const modelsData = await response.json();
            if (Array.isArray(modelsData)) {
                return modelsData.map((model: any) => ({
                    id: model.id.toString(),
                    name: model.name,
                }));
            }
        } else {
            console.warn("KIT: Failed to fetch chat models:", response.statusText);
        }
    } catch (error) {
        console.error("KIT: Error fetching chat models:", error);
    }
    return [];
}

export async function fetchUserServerSettings(settings: KITSetting): Promise<ServerUserConfig | null> {
    if (!settings.connectedToBackend || !settings.KITUrl) {
        return null;
    }
    try {
        const response = await fetch(`${settings.KITUrl}/api/settings?detailed=true`, {
            method: 'GET',
            headers: settings.KITApiKey ? { 'Authorization': `Bearer ${settings.KITApiKey}` } : {},
        });
        if (response.ok) {
            return await response.json() as ServerUserConfig;
        } else {
            console.warn("KIT: Failed to fetch user server settings:", response.statusText);
        }
    } catch (error) {
        console.error("KIT: Error fetching user server settings:", error);
    }
    return null;
}

export async function updateServerChatModel(modelId: string, settings: KITSetting): Promise<boolean> {
    if (!settings.connectedToBackend || !settings.KITUrl) {
        new Notice("️⛔️ Connect to KIT to update chat model.");
        return false;
    }

    try {
        const response = await fetch(`${settings.KITUrl}/api/model/chat?id=${modelId}`, {
            method: 'POST', // As per web app's updateModel function
            headers: settings.KITApiKey ? { 'Authorization': `Bearer ${settings.KITApiKey}` } : {},
        });
        if (response.ok) {
            settings.selectedChatModelId = modelId; // Update local mirror
            return true;
        } else {
            const errorData = await response.text();
            new Notice(`️⛔️ Failed to update chat model on server: ${response.status} ${errorData}`);
            console.error("KIT: Failed to update chat model:", response.status, errorData);
            return false;
        }
    } catch (error) {
        new Notice("️⛔️ Error updating chat model on server. See console.");
        console.error("KIT: Error updating chat model:", error);
        return false;
    }
}
