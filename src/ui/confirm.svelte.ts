/*
 * The question asked before something that cannot be undone. The browser's
 * own confirm() never showed on an iPhone, so the page asks it itself.
 */

interface Question {
  readonly text: string;
  /** The words on the button that goes ahead. */
  readonly action: string;
  answer(yes: boolean): void;
}

class Asking {
  /** Kept as it is, not proxied, so the question can tell whether it is still the one asked. */
  question = $state.raw<Question | null>(null);
}

export const asking = new Asking();

/** Asks the question in the page; true once the reader goes ahead. */
export function confirmAction(text: string, action: string): Promise<boolean> {
  asking.question?.answer(false);
  return new Promise((resolve) => {
    const question: Question = {
      text,
      action,
      answer(yes) {
        if (asking.question === question) asking.question = null;
        resolve(yes);
      },
    };
    asking.question = question;
  });
}
