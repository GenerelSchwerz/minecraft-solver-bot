import { StateBehavior } from "@nxg-org/mineflayer-static-statemachine";

export class IdleState extends StateBehavior {
    onStateEntered(...args: any[]): void | Promise<void> {
        console.log("Idle", args);
    }
};

export class SuccessState extends StateBehavior {
    onStateEntered(...args: any[]): void | Promise<void> {
        console.log("Success", args);
    }
};

export class FailState extends StateBehavior {
    onStateEntered(...args: any[]): void | Promise<void> {
        console.log("Fail", args);
    }
};