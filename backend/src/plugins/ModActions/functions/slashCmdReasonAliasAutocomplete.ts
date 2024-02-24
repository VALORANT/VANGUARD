export function slashCmdReasonAliasAutocomplete({ pluginData, interaction }) {
  const focusedOption = interaction.options.getFocused(true);
  const valueSoFar = focusedOption.value.toLowerCase();
  const aliases = pluginData.config.get().reason_aliases;
  const aliasKeyToAutocomplete = (aliasKey: string) => {
    const maybeCrop = (str: string, maxLength = 100) => {
      const cropCharacter = "…";
      const croppedString = `${str.slice(0, maxLength - cropCharacter.length).trim()}${cropCharacter}`;

      return str.length <= maxLength ? str : croppedString;
    };

    return {
      name: maybeCrop(aliases ? `${aliasKey}: ${aliases[aliasKey]}` : aliasKey, 100),
      value: maybeCrop(aliasKey, 100),
    };
  };

  if (!aliases || Object.keys(aliases).length < 1) {
    interaction.respond([]);
    return;
  }

  if (valueSoFar.length < 1) {
    interaction.respond(Object.keys(aliases).map(aliasKeyToAutocomplete).slice(0, 25));
    return;
  }

  interaction.respond(
    Object.keys(aliases)
      .filter((alias) => {
        return alias.toLowerCase().includes(valueSoFar) || aliases[alias].toLowerCase().includes(valueSoFar);
      })
      .map(aliasKeyToAutocomplete)
      .slice(0, 25),
  );
}
