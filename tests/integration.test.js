import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const testProjectDir = path.join(__dirname);
const linkCheckerDir = path.join(testProjectDir, '.link-checker');

describe('Astro Broken Links Checker Integration', () => {
  let buildResult;
  const logFilePath = path.join(linkCheckerDir, 'broken-links.log');
  const verifiedLinksPath = path.join(linkCheckerDir, 'verified-external-links.tsv');

  beforeAll(async () => {
    // Delete .link-checker directory if exists (fresh start)
    if (fs.existsSync(linkCheckerDir)) {
      fs.rmSync(linkCheckerDir, { recursive: true });
    }

    // Ensure the integration is built
    await execa('npm', ['run', 'build'], { cwd: path.join(__dirname, '..') });

    // Install dependencies for the test project
    await execa('npm', ['install'], { cwd: testProjectDir });

    // Run the build process of the test project
    buildResult = await execa('npm', ['run', 'build'], { cwd: testProjectDir });

    // Display the build result
    console.log(buildResult.stdout);
  }, 60000); // Increase timeout if necessary

  afterAll(() => {
    // Clean up
    if (fs.existsSync(logFilePath)) {
      fs.unlinkSync(logFilePath);
    }
  });

  it('should generate a broken-links.log file', () => {
    expect(fs.existsSync(logFilePath)).toBe(true);
  });

  it('should detect broken links', () => {
    const logContent = fs.readFileSync(logFilePath, 'utf-8');
    expect(logContent).toContain('Broken link');
    expect(logContent).toContain('/non-existent-page');
    expect(logContent).toContain('/another-missing-page');
    expect(logContent).toContain('/trailing-slash/');
    expect(logContent).toContain('./relative-broken-link');
    expect(logContent).toContain('../path/changing/relative-broken-link');
    expect(logContent).toContain('http://example.invalid/page');
    expect(logContent).toContain('http://example.invalid/page?query=string#fragment');
    expect(logContent).toContain('http://example.invalid/image.jpg');
    expect(logContent).toContain('/missing.jpg');

    expect(logContent).toContain('Found in');
    expect(logContent).toContain('/');
    // Remove the expectation for '/about' as a broken link
    // expect(logContent).toContain('/about');
  });

  it('should not report valid links as broken', () => {
    const logContent = fs.readFileSync(logFilePath, 'utf-8');
    expect(logContent).not.toContain('Broken link: /about'); // Expect '/about' to not be reported as broken
    expect(logContent).not.toContain('Broken link: /\n'); // Expect '/about' to not be reported as broken
    expect(logContent).not.toContain('Broken link: https://microsoft.com'); // Expect 'https://microsoft.com' to not be reported as broken
    expect(logContent).not.toContain('Broken link: /redirected'); // Expect '/redirected' to not be reported as broken
    expect(logContent).not.toContain('Broken link: /exists.jpg'); // Expect '/exists.jpg' to not be reported as broken
  });

  it('should generate .gitignore in link-checker directory', () => {
    const gitignorePath = path.join(linkCheckerDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('broken-links.log');
  });

  it('should use cached external links on subsequent builds', async () => {
    // Add the failing URL to the cache as "verified"
    const cacheEntry = `http://example.invalid/page\tok\t200\t${new Date().toISOString()}`;
    fs.writeFileSync(verifiedLinksPath, cacheEntry, 'utf-8');

    // Rebuild
    await execa('npm', ['run', 'build'], { cwd: testProjectDir });

    // Should NOT appear in broken links now (cached as valid)
    const logContent = fs.readFileSync(logFilePath, 'utf-8');
    expect(logContent).not.toContain('Broken link: http://example.invalid/page\n');
  }, 60000);
});
