# Release Delta Spec

## Added Requirements

### Requirement: Preview builds must use semver prerelease versions

Desktop preview builds must use semver prerelease versions such as `0.5.6-beta.1` instead of sharing the same plain version number with the eventual stable release.

#### Scenario: Maintainer prepares a desktop preview release

- Given a desktop build intended for prerelease testing
- When the build is packaged and tagged
- Then its app version contains a prerelease component like `beta.N`
- And the corresponding GitHub release is marked as prerelease

#### Scenario: Maintainer republishes a historical beta below stable

- Given a historical preview build previously shared the same plain version as stable
- When the maintainer republishes it as a backfilled prerelease such as `0.5.5-beta.1`
- Then the docs explicitly describe it as a historical beta / manual-download testing build
- And stable-facing download links remain pointed at the stable release `0.5.5`

### Requirement: Installed preview builds default to the preview update lane

Desktop clients running a prerelease app version must default to the preview update lane unless the user explicitly changed the setting before.

#### Scenario: User launches a prerelease desktop build for the first time

- Given the installed app version contains a prerelease component
- And the user has not explicitly chosen a different update lane before
- When PromptHub hydrates settings on startup
- Then the effective update lane defaults to preview

### Requirement: Update checks must never present downgrade candidates as available updates

Desktop update checks must filter out remote versions that are less than or equal to the currently running version.

#### Scenario: Preview build checks the stable lane

- Given a user is running a newer preview build than the latest stable release
- When PromptHub checks for updates
- Then the UI does not show the older stable release as an available update

### Requirement: Preview checks must not depend on missing custom preview manifests

Desktop preview update checks must use a provider / manifest strategy that exists in released artifacts and is covered by CI verification.

#### Scenario: User checks updates on the preview lane

- Given the desktop client is configured for preview updates
- When it checks for updates
- Then it does not request a nonexistent manifest like `preview.yml`
- And CI guarantees the expected update metadata exists for the chosen strategy

### Requirement: Background update checks must not override a visible available-update state

Desktop background update polling must not force the UI back into a transient checking state while the user already has a visible available or downloaded update.

#### Scenario: User has a pending available update in the UI

- Given PromptHub already detected an available update
- When a scheduled background check runs again
- Then the top bar indicator and update dialog do not start flickering between `available` and `checking`
