import type {Command, CommandId} from '../commands';

/** Stores command definitions by stable ID for menus, keybindings, and other UI. */
export class CommandRegistry {
    private readonly byId: ReadonlyMap<string, Command>;

    constructor(commands: readonly Command[]) {
        const byId = new Map<string, Command>();
        for (const command of commands) {
            if (byId.has(command.id)) throw new Error(`Duplicate command ID: ${command.id}`);
            byId.set(command.id, command);
        }
        this.byId = byId;
    }

    get(id: string): Command | undefined {
        return this.byId.get(id);
    }

    require(id: CommandId): Command {
        const command = this.get(id);
        if (!command) throw new Error(`Unknown command ID: ${id}`);
        return command;
    }

    getAll(): Command[] {
        return [...this.byId.values()];
    }
}
