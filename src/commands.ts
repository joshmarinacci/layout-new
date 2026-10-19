export interface Command {
    id: string;
    name: string;
    description: string;
    shortcut?: string;
    keywords?: string[];
    enabled?: boolean;
    run: () => void;
}