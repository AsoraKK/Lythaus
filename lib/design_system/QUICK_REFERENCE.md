# Lythaus design system quick reference

[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) is the canonical design and usage guide.
[COMPONENT_VERIFICATION.md](COMPONENT_VERIFICATION.md) records verification limits.

```dart
LythButton.primary(label: 'Save', onPressed: save, isLoading: saving)
LythButton.destructive(label: 'Delete', onPressed: confirmDeletion)
LythTextInput.email(label: 'Email', onChanged: updateEmail)
LythTextInput.password(label: 'Password', onChanged: updatePassword)
LythTextInput(label: 'Message', maxLines: 5, onChanged: updateMessage)
LythCard(child: content)
LythCard.clickable(onTap: openDetails, child: content)
LythSnackbar.success(context: context, message: 'Changes saved')
LythListRow(title: 'Account security', onTap: openSecurity)
```

Use `context.colorScheme` for Material roles; `context.semanticColors` for
feedback and muted metadata. Use `outline` for a control boundary and
`outlineVariant` for a decorative divider. Use `bodyLarge` for reading,
`bodyMedium` for interface prose and `bodySmall` only for metadata.

Existing spacing names: `xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32,
huge=48`. Minimum Flutter targets are 48. Do not fix a control's height when its
label can grow with text scaling.
