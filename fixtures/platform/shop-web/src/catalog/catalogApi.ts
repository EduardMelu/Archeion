import axios from "axios";

// No part declares who serves this prefix: the target stays unknown rather than guessed.
export const listProducts = () => axios.get("/catalog-api/products");
