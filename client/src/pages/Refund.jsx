import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

export default function Refund() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />VeoRec</Link>
        <h1>Refund &amp; Cancellation Policy</h1>
        <p className={styles.updated}>Last updated: June 3, 2026</p>

        <p>
          We want you to be happy with VeoRec Pro. This policy explains how cancellations and
          refunds work. Payments are processed by our Merchant of Record, <strong>Paddle</strong>,
          and refunds are issued through Paddle.
        </p>

        <h2>Free plan</h2>
        <p>The Free plan is free forever — there is nothing to cancel or refund.</p>

        <h2>Cancelling Pro</h2>
        <p>
          You can cancel your VeoRec Pro subscription at any time from your account page or by
          emailing us. When you cancel, you keep Pro features until the end of your current
          billing period, and you will not be charged again.
        </p>

        <h2>Refunds</h2>
        <ul>
          <li><strong>14-day money-back guarantee.</strong> If you&rsquo;re not satisfied, contact us within 14 days of your first payment for a full refund.</li>
          <li>Renewal charges can be refunded within 7 days of the renewal date if the subscription was not used in that period.</li>
          <li>Refunds are returned to your original payment method by Paddle, typically within 5–10 business days.</li>
        </ul>

        <h2>How to request a refund or cancel</h2>
        <p>
          Email <a href="mailto:codingclicks@gmail.com">codingclicks@gmail.com</a> with the email
          address on your account, or manage your subscription from the receipt Paddle emailed
          you. We aim to respond within 2 business days.
        </p>

        <p className={styles.footer}>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms of Service</Link> · <Link to="/">← Back to VeoRec</Link>
        </p>
      </div>
    </div>
  );
}
