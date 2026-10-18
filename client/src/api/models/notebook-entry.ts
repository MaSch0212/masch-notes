export type NotebookEntry = {
    id: number;
    notebookId: number;
    name?: string;
    category?: string;
    date?: string;

    /**
     * 1 = legacy AES-CBC, 2 = AES-GCM with the user's data key.
     */
    encVersion: number;

    content?: string;
  };
