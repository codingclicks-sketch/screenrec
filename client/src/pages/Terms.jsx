import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

export default function Terms() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />VeoRec</Link>
        <h1>Terms of Service</h1>
        <p className={styles.updated}>Last updated: June 3, 2026</p>

        <p>
          These Terms of Service ("Terms") govern your use of VeoRec ("we", "our", or
          "the Service"), a screen-recording tool and Chrome extension that lets you record
          your screen, camera and microphone and share videos via a link. By creating an
          account or using the Service you agree to these Terms.
        </p>

        <h2>1. Accounts</h2>
        <p>
          You must provide accurate information when creating an account and are responsible
          for keeping your password secure and for all activity under your account. You must
          be at least 16 years old to use VeoRec.
        </p>

        <h2>2. Acceptable use</h2>
        <ul>
          <li>You may only record and share content you have the right to record and share.</li>
          <li>You may not use VeoRec to record or distribute unlawful, infringing, harassing, or harmful content.</li>
          <li>You may not attempt to disrupt, reverse-engineer, or abuse the Service or its infrastructure.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate these Terms.</p>

        <h2>3. Your content</h2>
        <p>
          You retain ownership of the videos you record. You grant us the limited rights needed
          to store, process, and deliver your videos so the Service can function (for example,
          hosting them and generating shareable links). You are responsible for the content you
          record and share.
        </p>

        <h2>4. Plans &amp; billing</h2>
        <p>
          VeoRec offers a free plan and a paid <strong>Pro</strong> plan billed monthly. Payments
          are processed by our reseller and Merchant of Record, <strong>Paddle</strong>
          (Paddle.com), who handles the transaction, invoicing, and applicable taxes. By
          purchasing Pro you also agree to Paddle&rsquo;s buyer terms. Subscriptions renew
          automatically until cancelled. You can cancel anytime from your account or by
          contacting us; see our <Link to="/refund">Refund &amp; Cancellation Policy</Link>.
        </p>

        <h2>5. Service availability</h2>
        <p>
          The Service is provided on an "as-is" and "as-available" basis. We work to keep it
          running reliably but do not guarantee uninterrupted or error-free operation, and we
          may change or discontinue features.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, VeoRec is not liable for any indirect,
          incidental, or consequential damages, or for loss of data or profits, arising from
          your use of the Service.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will be reflected by the
          "Last updated" date above. Continued use after changes means you accept the new Terms.
        </p>

        <h2>8. Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
          <a href="mailto:codingclicks@gmail.com">codingclicks@gmail.com</a>.
        </p>

        <p className={styles.footer}>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/refund">Refund Policy</Link> · <Link to="/">← Back to VeoRec</Link>
        </p>
      </div>
    </div>
  );
}
