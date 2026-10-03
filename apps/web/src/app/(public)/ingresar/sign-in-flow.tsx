'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOnboarding } from '../onboarding/store';
import { CodeStep } from '../onboarding/steps/code-step';
import { ContactStep } from '../onboarding/steps/contact-step';
import { StepShell } from '../onboarding/steps/step-shell';

/** Returning families: email + code, then their trips. */
export function SignInFlow() {
  const router = useRouter();
  const [pending, setPending] = useState<{ email: string; challengeId: string } | null>(null);

  if (!pending) {
    return (
      <StepShell title="Ingresar">
        <ContactStep
          askName={false}
          defaults={{ fullName: '', email: '' }}
          onCodeSent={(data) => setPending(data)}
        />
      </StepShell>
    );
  }
  return (
    <StepShell title="Revisá tu email">
      <CodeStep
        email={pending.email}
        fullName=""
        challengeId={pending.challengeId}
        onVerified={(applicant) => {
          // Read the stored draft first, so it cannot overwrite the new session state afterwards,
          // then discard it: it may belong to someone else who used this device.
          void Promise.resolve(useOnboarding.persist.rehydrate()).then(() => {
            useOnboarding.getState().reset();
            useOnboarding.getState().update({
              signedIn: true,
              privacyAccepted: true,
              fullName: applicant.fullName,
              challengeId: null,
            });
            router.replace('/mis-viajes');
          });
        }}
        onNewChallenge={(challengeId) => setPending({ ...pending, challengeId })}
        onChangeEmail={() => setPending(null)}
      />
    </StepShell>
  );
}
