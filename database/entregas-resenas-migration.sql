-- Ejecutar una sola vez en la base backtome para habilitar entregas y reseñas.
-- No elimina ni modifica las publicaciones perdidas o encontradas existentes.

ALTER TABLE objetos
    MODIFY COLUMN estado ENUM('publicado', 'archivado', 'entregado') NOT NULL DEFAULT 'publicado',
    ADD COLUMN entregado_en DATETIME NULL AFTER estado;

CREATE TABLE IF NOT EXISTS resenas_entregas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    objeto_id BIGINT UNSIGNED NOT NULL,
    autor_id BIGINT UNSIGNED NOT NULL,
    comentario VARCHAR(500) NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_resenas_entregas_objeto_autor (objeto_id, autor_id),
    KEY ix_resenas_entregas_creado (creado_en),
    CONSTRAINT fk_resenas_entregas_objeto
        FOREIGN KEY (objeto_id) REFERENCES objetos (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_resenas_entregas_autor
        FOREIGN KEY (autor_id) REFERENCES usuarios (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
