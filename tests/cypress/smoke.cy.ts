/// <reference types="cypress" />

describe('Peerstellation smoke', () => {
  it('exposes the observatory and its keyboard-accessible controls', () => {
    cy.visit('/');
    cy.get('#universe-main').should('be.visible');
    cy.get('#universe-canvas')
      .should('be.visible')
      .and('have.attr', 'tabindex', '0');
    cy.get('#settings-button').should('have.attr', 'aria-haspopup', 'dialog');
    cy.get('#peer-explorer-button').should('be.visible');
  });
});
