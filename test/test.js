const fs = require('fs');
const path = require('path');

const test = require('ava');

const SpamScanner = require('..');

function fixtures(name) {
  return path.join(__dirname, 'fixtures', name);
}

const scanner = new SpamScanner();

test.before(async () => {
  await scanner.load();
});

test('should detect spam', async t => {
  const scan = await scanner.scan(fixtures('spam.eml'));
  t.true(scan.is_spam);
  t.true(typeof scan.results.classification === 'object');
  t.is(scan.results.classification.category, 'spam');
});

test('should detect spam fuzzy', async t => {
  const scan = await scanner.scan(fixtures('spam-fuzzy.eml'));
  t.true(scan.is_spam);
  t.true(typeof scan.results.classification === 'object');
  t.is(scan.results.classification.category, 'spam');
});

test('should detect ham', async t => {
  const scan = await scanner.scan(fixtures('ham.eml'));
  t.false(scan.is_spam);
  t.true(typeof scan.results.classification === 'object');
  t.is(scan.results.classification.category, 'ham');
});

test('should detect not phishing with different org domains (temporary)', async t => {
  const scan = await scanner.scan(fixtures('phishing.eml'));
  t.false(scan.is_spam);
  t.true(scan.results.phishing.length === 0);
});

test('should detect idn masquerading', async t => {
  const scan = await scanner.scan(fixtures('idn.eml'));
  t.true(scan.is_spam);
  t.true(scan.results.phishing.length > 0);
});

test('should detect executable files', async t => {
  const scan = await scanner.scan(fixtures('executable.eml'));
  t.true(scan.is_spam);
  t.true(scan.results.executables.length > 0);
});

test('should check against PhishTank', async t => {
  t.true(scanner._phishTankLoaded);
  t.true(Array.isArray(scanner._phishTankUrls));
  t.true(scanner._phishTankUrls.length > 0);
  const link = scanner._phishTankUrls[0];
  const results = await scanner.getPhishingResults({
    html: `<a href="${link}">test</a>`,
    text: link
  });
  t.true(
    results.messages.includes(
      `Link of "${link}" was detected by PhishTank to be phishing-related.`
    )
  );
  t.true(
    results.messages.includes(
      `Phishing whitelist requests can be filed at ${scanner.config.issues}.`
    )
  );
  t.true(results.links.includes(scanner.getNormalizedUrl(link)));
});

test('should check against Cloudflare', async t => {
  const link = Buffer.from('eHZpZGVvcy5jb20=', 'base64').toString();
  const results = await scanner.getPhishingResults({
    html: `<a href="${link}">test</a>`,
    text: link
  });
  t.deepEqual(results.messages, [
    `Link of "${link}" was detected by Cloudflare to contain malware, phishing, and/or adult content.`,
    `Phishing whitelist requests can be filed at ${scanner.config.issues}.`
  ]);
});

//
// NOTE: I added support for GTUBE because I have a suspicion that some
// large email providers may send test emails with the GTUBE test
// to see if the mail server has spam filtering enabled, but this is
// also a nice way for us to send test messages to see that Spam Scanner
// is actually running and parsing messages properly
//
// <https://spamassassin.apache.org/gtube/>
// <https://spamassassin.apache.org/gtube/gtube.txt>
//
test('GTUBE test', async t => {
  const results = await scanner.getArbitraryResults({
    html: `
Subject: Test spam mail (GTUBE)
Message-ID: <GTUBE1.1010101@example.net>
Date: Wed, 23 Jul 2003 23:30:00 +0200
From: Sender <sender@example.net>
To: Recipient <recipient@example.net>
Precedence: junk
MIME-Version: 1.0
Content-Type: text/plain; charset=us-ascii
Content-Transfer-Encoding: 7bit

This is the GTUBE, the
  Generic
  Test for
  Unsolicited
  Bulk
  Email

If your spam filter supports it, the GTUBE provides a test by which you
can verify that the filter is installed correctly and is detecting incoming
spam. You can send yourself a test mail containing the following string of
characters (in upper case and with no white spaces and line breaks):

XJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X

You should send this test mail from an account outside of your network.
    `.trim()
  });
  t.deepEqual(results, [
    'Message detected to contain the GTUBE test from <https://spamassassin.apache.org/gtube/>'
  ]);
});

//
// virus scanning detection against EICAR test
//
// <https://en.wikipedia.org/wiki/EICAR_test_file>
// <https://secure.eicar.org/eicar_com.txt>
// <https://www.eicar.org/?page_id=3950>
//
test('EICAR test', async t => {
  const content = await fs.promises.readFile(fixtures('eicar.com.txt'));
  const results = await scanner.getVirusResults({
    attachments: [{ content }]
  });
  t.deepEqual(results, [
    'Attachment #1 was infected with Win.Test.EICAR_HDB-1'
  ]);
});

test.todo('50/50 ham vs spam dataset test');
test.todo('test classifier.json against dataset to determine % accuracy');
test.todo('should detect nsfw using nsfw.js');
test.todo('should detect phishing querystring redirections');
